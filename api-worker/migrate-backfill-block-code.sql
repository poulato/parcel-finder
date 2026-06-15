UPDATE saved_parcels SET block_code = '0' WHERE block_code IS NULL OR block_code = '';
UPDATE saved_parcels SET block_code = '1' WHERE LOWER(IFNULL(parcel_title, '')) = 'house';
UPDATE saved_parcels SET block_code = REPLACE(block_code, '.0', '') WHERE block_code LIKE '%.0';
