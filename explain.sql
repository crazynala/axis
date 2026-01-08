EXPLAIN (ANALYZE, BUFFERS)

WITH movement_rows AS (                                                                                                                                                   
        SELECT pm."productId" AS product_id,                                                                                                                              
           lower(TRIM(BOTH FROM COALESCE(pm."movementType", ''::text))) AS mt,                                                                                            
           pm."locationInId" AS loc_in,                                                                                                                                   
           pm."locationOutId" AS loc_out,                                                                                                                                 
           COALESCE(pm.quantity, 0::numeric) AS qty                                                                                                                       
          FROM "ProductMovement" pm                                                                                                                                       
         WHERE pm."productId" IS NOT NULL                                                                                                                                 
       ), movement_contrib AS (                                                                                                                                           
        SELECT movement_rows.product_id,                                                                                                                                  
           movement_rows.loc_in AS location_id,                                                                                                                           
           abs(movement_rows.qty) AS qty                                                                                                                                  
          FROM movement_rows                                                                                                                                              
         WHERE movement_rows.mt = 'transfer'::text AND movement_rows.loc_in IS NOT NULL                                                                                   
       UNION ALL                                                                                                                                                          
        SELECT movement_rows.product_id,                                                                                                                                  
           movement_rows.loc_out AS location_id,                                                                                                                          
           - abs(movement_rows.qty) AS qty                                                                                                                                
          FROM movement_rows                                                                                                                                              
         WHERE movement_rows.mt = 'transfer'::text AND movement_rows.loc_out IS NOT NULL                                                                                  
       UNION ALL                                                                                                                                                          
        SELECT movement_rows.product_id,                                                                                                                                  
           movement_rows.loc_in AS location_id,                                                                                                                           
           movement_rows.qty                                                                                                                                              
          FROM movement_rows                                                                                                                                              
         WHERE movement_rows.mt <> 'transfer'::text AND movement_rows.loc_in IS NOT NULL                                                                                  
       UNION ALL                                                                                                                                                          
        SELECT movement_rows.product_id,                                                                                                                                  
           movement_rows.loc_out AS location_id,                                                                                                                          
           movement_rows.qty                                                                                                                                              
          FROM movement_rows                                                                                                                                              
         WHERE movement_rows.mt <> 'transfer'::text AND movement_rows.loc_out IS NOT NULL                                                                                 
       ), product_movement_totals AS (                                                                                                                                    
        SELECT t.product_id,                                                                                                                                              
           sum(t.qty) AS mov_qty,                                                                                                                                         
           count(*) AS mov_n                                                                                                                                              
          FROM ( SELECT movement_rows.product_id,                                                                                                                         
                       CASE                                                                                                                                               
                           WHEN movement_rows.mt = 'transfer'::text THEN 0::numeric                                                                                       
                           ELSE movement_rows.qty                                                                                                                         
                       END AS qty                                                                                                                                         
                  FROM movement_rows) t                                                                                                                                   
         GROUP BY t.product_id                                                                                                                                            
       ), batch_rows AS (                                                                                                                                                 
        SELECT b.id AS batch_id,                                                                                                                                          
           b."productId" AS product_id,                                                                                                                                   
           b."locationId" AS location_id,                                                                                                                                 
           COALESCE(b.quantity, 0::numeric) AS batch_declared_qty,                                                                                                        
           b."codeMill",                                                                                                                                                  
           b."codeSartor",                                                                                                                                                
           b.name AS batch_name,                                                                                                                                          
           b."receivedAt" AS received_at                                                                                                                                  
          FROM "Batch" b                                                                                                                                                  
         WHERE b."productId" IS NOT NULL                                                                                                                                  
       ), movement_line_batch AS (                                                                                                                                        
        SELECT pml."batchId" AS batch_id,                                                                                                                                 
           pml."productId" AS product_id,                                                                                                                                 
           COALESCE(pml.quantity, 0::numeric) AS qty                                                                                                                      
          FROM "ProductMovementLine" pml                                                                                                                                  
         WHERE pml."productId" IS NOT NULL AND pml."batchId" IS NOT NULL                                                                                                  
       ), batch_qty AS (                                                                                                                                                  
        SELECT br.batch_id,                                                                                                                                               
           br.product_id,                                                                                                                                                 
           COALESCE(sum(mlb.qty), 0::numeric) AS line_qty,                                                                                                                
           count(mlb.qty) AS line_n                                                                                                                                       
          FROM batch_rows br                                                                                                                                              
            LEFT JOIN movement_line_batch mlb ON mlb.batch_id = br.batch_id                                                                                               
         GROUP BY br.batch_id, br.product_id                                                                                                                              
       ), batch_effective AS (                                                                                                                                            
        SELECT br.batch_id,                                                                                                                                               
           br.product_id,                                                                                                                                                 
               CASE                                                                                                                                                       
                   WHEN bq.line_n > 0 THEN bq.line_qty                                                                                                                    
                   ELSE br.batch_declared_qty                                                                                                                             
               END AS qty,                                                                                                                                                
           br.location_id,                                                                                                                                                
           br."codeMill",                                                                                                                                                 
           br."codeSartor",                                                                                                                                               
           br.batch_name,                                                                                                                                                 
           br.received_at                                                                                                                                                 
          FROM batch_rows br                                                                                                                                              
            LEFT JOIN batch_qty bq ON bq.batch_id = br.batch_id                                                                                                           
       ), product_batch_totals AS (                                                                                                                                       
        SELECT batch_effective.product_id,                                                                                                                                
           COALESCE(sum(batch_effective.qty), 0::numeric) AS batch_sum                                                                                                    
          FROM batch_effective                                                                                                                                            
         GROUP BY batch_effective.product_id                                                                                                                              
       ), product_totals AS (                                                                                                                                             
        SELECT pbt.product_id,                                                                                                                                            
               CASE                                                                                                                                                       
                   WHEN pmt.mov_n > 0 THEN pmt.mov_qty                                                                                                                    
                   ELSE pbt.batch_sum                                                                                                                                     
               END AS total_qty                                                                                                                                           
          FROM product_batch_totals pbt                                                                                                                                   
            LEFT JOIN product_movement_totals pmt ON pmt.product_id = pbt.product_id                                                                                      
       )                                                                                                                                                                  
SELECT pt.product_id,                                                                                                                                                     
   pt.total_qty,                                                                                                                                                          
   lc.location_id,                                                                                                                                                        
   COALESCE(l.name, ''::text) AS location_name,                                                                                                                           
   COALESCE(sum(lc.qty), 0::numeric) AS location_qty,                                                                                                                     
   be.batch_id,                                                                                                                                                           
   COALESCE(be."codeMill", ''::text) AS code_mill,                                                                                                                        
   COALESCE(be."codeSartor", ''::text) AS code_sartor,                                                                                                                    
   COALESCE(be.batch_name, ''::text) AS batch_name,                                                                                                                       
   be.received_at,                                                                                                                                                        
   be.location_id AS batch_location_id,                                                                                                                                   
   COALESCE(bl.name, ''::text) AS batch_location_name,                                                                                                                    
   COALESCE(be.qty, 0::numeric) AS batch_qty                                                                                                                              
  FROM product_totals pt                                                                                                                                                  
    LEFT JOIN movement_contrib lc ON lc.product_id = pt.product_id                                                                                                        
    LEFT JOIN "Location" l ON l.id = lc.location_id                                                                                                                       
    LEFT JOIN batch_effective be ON be.product_id = pt.product_id                                                                                                         
    LEFT JOIN "Location" bl ON bl.id = be.location_id                                                                                                                     
 GROUP BY pt.product_id, pt.total_qty, lc.location_id, l.name, be.batch_id, be."codeMill", be."codeSartor", be.batch_name, be.received_at, be.location_id, bl.name, be.qty;

